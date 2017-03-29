#!/bin/bash
npm install ~/gateway/
sudo forever --sourceDir ~/gateway  start  gateway.js
#npm start ~/gateway/
