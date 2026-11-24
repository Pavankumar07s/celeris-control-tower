#!/bin/bash
# wait until MemAvailable >= $1 MB (max ~25 min)
need=${1:-2500}
for i in $(seq 1 300); do
  avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
  if [ "$avail" -ge "$need" ]; then echo "available ${avail} MB"; exit 0; fi
  sleep 5
done
echo "timeout: available ${avail} MB"; exit 1
