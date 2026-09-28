# Architecture

This repository contains the platform-independent Dart tournament application.

## Components

- Traefik handles external routing.
- Frontend is the admin interface.
- Backend contains business logic and database access.
- Broadcasting renders the tournament display for large screens.
- PostgreSQL stores tournament data.

## Communication

Frontend and Broadcasting call the backend through Traefik.
The backend alone has access to PostgreSQL.
