// Универсальная таблица: принимает описание колонок и массив строк,
// используется на страницах Каталога, Бирж, Статистики и Календаря —
// чтобы не писать разметку <table> заново на каждой странице.
//
// columns: [{ key, header, render?(row) }]
function DataTable({ columns, rows, getRowKey }) {
  if (rows.length === 0) {
    return <p className="empty-state">Данных пока нет.</p>
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={getRowKey(row)}>
            {columns.map((column) => (
              <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default DataTable
