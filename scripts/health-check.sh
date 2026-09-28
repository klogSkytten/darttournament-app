#!/usr/bin/env bash
set -eu

curl -fsS http://localhost/api/health || exit 1
