#!/bin/bash
echo "Cleaning up existing Node.js processes..."
pkill -f "node"
sleep 2
echo "Cleanup completed"