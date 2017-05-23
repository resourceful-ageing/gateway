#!/bin/bash
npm install ~/resourceful-gateway/
sudo forever --sourceDir ~/resourceful-gateway -l forever.log -o out.log -e err.log -a start gateway.js
