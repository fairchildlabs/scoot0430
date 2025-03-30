#!/bin/bash

# Kill any existing socat processes
pkill socat || true

# Forward port 5000 to port 5002
socat TCP-LISTEN:5000,fork TCP:localhost:5002 &

# Start the server
npm run dev