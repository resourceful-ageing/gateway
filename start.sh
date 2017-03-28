#!/bin/bash
npm install ~/resourceful-ageing/
sudo forever --sourceDir ~/resourceful-ageing  start  resourceful-ageing.js
#npm start ~/resourceful-ageing/
