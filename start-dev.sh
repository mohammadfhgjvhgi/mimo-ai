#!/bin/bash
cd /home/z/my-project
exec bun run dev >> /home/z/my-project/dev.log 2>&1
