# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

kero3d is a Node.js frontend project using Vite (port 5173) with Docker-based development.

## Development Commands

### Docker Development (Recommended)
```bash
docker-compose up --build     # Start dev server with hot reload
docker-compose down           # Stop containers
```

### Local Development (requires package.json setup)
```bash
npm install                   # Install dependencies
npm run dev                   # Start Vite dev server
```

The dev server runs at http://localhost:5173

## Architecture

- **Dockerfile**: Node.js 24 Alpine-based container
- **docker-compose.yml**: Mounts project directory to `/app` with hot reload support via volume caching
