#!/bin/bash
# Test what happens with xvfb-run
xvfb-run -a -s "-screen 0 1280x1024x24" node index.js
