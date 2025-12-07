#!/bin/sh
set -e
npx next build
npx @cloudflare/next-on-pages
