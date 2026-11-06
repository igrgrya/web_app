#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Select Python 3.12 in Environment > Python before running this script.
python -m venv .venv
.venv/bin/python -m pip install --no-cache-dir -r backend/requirements.txt
echo 'Installed. Next: .venv/bin/python deploy/configure.py'
