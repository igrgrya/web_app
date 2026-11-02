const json=(data,status=200)=>Response.json(data,{status});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const columns={ticker:'i.ticker',name:'i.name',type:'i.instrument_type',exchange:'e.code',sector:'s.name',price:'p.price',change:'p.change_percent',volume:'p.volume'};
const projection=`SELECT i.id,i.ticker,i.name,i.instrument_type AS type,e.code AS exchange,s.name AS sector,i.currency,i.description,i.listed_date,p.price,p.change_percent,p.volume,p.as_of_date FROM instruments i JOIN price_snapshots p ON p.instrument_id=i.id AND p.as_of_date=(SELECT MAX(as_of_date) FROM price_snapshots) LEFT JOIN exchanges e ON e.id=i.exchange_id LEFT JOIN sectors s ON s.id=i.sector_id`;
let initialization;
async function seed(db){
 const count=await db.prepare('SELECT COUNT(*) AS n FROM price_snapshots').first();
 if(count.n===DATA.price_snapshots.length)return;
 const statements=[];
 for(const table of ['exchanges','sectors','instruments','price_snapshots'])for(const original of DATA[table]){
  const row={...original};
  if(table==='instruments')row.search_text=`${row.ticker} ${row.name}`.toLowerCase();
  const keys=Object.keys(row);
  statements.push(db.prepare(`INSERT OR IGNORE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(row)));
 }
 await db.batch(statements);
}
function integer(params,name,fallback,min,max){
 const raw=params.get(name);if(raw===null)return fallback;
 const n=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<min||n>max)fail(422,`Недопустимый параметр ${name}`);return n;
}
async function api(url,db){
 initialization??=seed(db).catch(error=>{initialization=undefined;throw error;});await initialization;
 const path=url.pathname,params=url.searchParams;
 const all=async(sql,args=[])=>(await db.prepare(sql).bind(...args).all()).results;
 if(path==='/api/health'){
  const i=await db.prepare('SELECT COUNT(*) AS n FROM instruments').first(),p=await db.prepare('SELECT COUNT(*) AS n FROM price_snapshots').first();
  return json({status:'ok',database:'connected',instruments:i.n,price_snapshots:p.n});
 }
 if(path==='/api/instruments'||path==='/api/search'){
  const sort=params.get('sort')??'ticker',direction=params.get('direction')??'asc';
  if(!Object.hasOwn(columns,sort))fail(400,'Неизвестная колонка сортировки');
  if(!['asc','desc'].includes(direction))fail(422,'Неверное направление сортировки');
  const type=params.get('instrument_type');if(type!==null&&!['stock','etf','fund','bond'].includes(type))fail(422,'Неверный тип инструмента');
  const conditions=[],args=[];
  for(const [param,col]of [['exchange','e.code'],['sector','s.name'],['instrument_type','i.instrument_type']])if(params.get(param)){conditions.push(`${col}=?`);args.push(params.get(param));}
  let limit='';
  if(path==='/api/search'){
   const q=params.get('q');if(!q||q.length>100)fail(422,'Поиск должен содержать от 1 до 100 символов');
   conditions.push('instr(i.search_text,?) > 0');args.push(q.toLowerCase());limit=` LIMIT ${integer(params,'limit',20,1,100)}`;
  }
  return json(await all(`${projection}${conditions.length?' WHERE '+conditions.join(' AND '):''} ORDER BY ${columns[sort]} ${direction},i.ticker ASC${limit}`,args));
 }
 if(path==='/api/sectors/summary')return json(await all(`SELECT s.name AS sector,i.currency,COUNT(i.id) AS instruments_count,ROUND(AVG(p.price),2) AS avg_price,SUM(p.volume) AS total_volume FROM sectors s LEFT JOIN instruments i ON i.sector_id=s.id LEFT JOIN price_snapshots p ON p.instrument_id=i.id AND p.as_of_date=(SELECT MAX(as_of_date) FROM price_snapshots) GROUP BY s.name,i.currency ORDER BY s.name,i.currency`));
 if(path==='/api/top-movers'){
  const n=integer(params,'limit',5,1,18);return json({gainers:await all(`${projection} ORDER BY p.change_percent DESC,i.ticker LIMIT ${n}`),losers:await all(`${projection} ORDER BY p.change_percent ASC,i.ticker LIMIT ${n}`)});
 }
 const match=path.match(/^\/api\/instruments\/([^/]+)(\/prices)?$/);
 if(match){
  if(!/^-?\d+$/.test(match[1]))fail(422,'Некорректный идентификатор');const id=Number(match[1]);
  if(!(await db.prepare('SELECT id FROM instruments WHERE id=?').bind(id).first()))fail(404,'Инструмент не найден');
  if(match[2]){const days=integer(params,'days',30,1,365);return json((await all('SELECT as_of_date AS date,price,change_percent,volume FROM price_snapshots WHERE instrument_id=? ORDER BY as_of_date DESC LIMIT ?',[id,days])).reverse());}
  const rows=await all(`${projection} WHERE i.id=?`,[id]);if(!rows.length)fail(404,'Инструмент не найден');return json(rows[0]);
 }
 return json({detail:'Маршрут не найден'},404);
}
export default{async fetch(request,env){
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method))return json({detail:'Метод не поддерживается'},405);
 try{
  if(url.pathname.startsWith('/api/'))return await api(url,env.DB);
  if(url.pathname==='/lab3')return Response.redirect(url.origin+'/lab3/',308);
  const key=url.pathname==='/'?'/index.html':url.pathname==='/lab3/'?'/lab3/index.html':url.pathname;
  const asset=ASSETS[key];if(!asset)return new Response('Страница не найдена',{status:404});
  return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)),{headers:{'Content-Type':asset.type,'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
 }catch(error){if(!error.status)console.error('Database request failed',error.message);return json({detail:error.status?error.message:'Не удалось получить данные. Повторите запрос.'},error.status??503);}
}};
