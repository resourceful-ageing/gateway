#!/bin/bash
npm install ~/resourceful-gateway/
sudo forever --sourceDir ~/resourceful-gateway  start  gateway.js
