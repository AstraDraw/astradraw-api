#!/bin/sh
set -e

# =============================================================================
# AstraDraw API Docker Entrypoint
# =============================================================================
#
# This script handles container initialization before starting the API server.
# It supports Docker secrets (files) and environment variables for configuration.
#
# Main responsibilities:
# 1. Read secrets from files (_FILE suffix) or environment variables
# 2. Build DATABASE_URL from individual PostgreSQL components (for Prisma CLI)
# 3. Run database migrations (with fallback to schema push)
# 4. Start the NestJS API server
#
# Environment Variables (all support _FILE suffix for Docker secrets):
#   DATABASE_URL          - Full PostgreSQL connection string (optional)
#   POSTGRES_USER         - Database username (default: excalidraw)
#   POSTGRES_PASSWORD     - Database password (required if DATABASE_URL not set)
#   POSTGRES_HOST         - Database hostname (default: postgres)
#   POSTGRES_PORT         - Database port (default: 5432)
#   POSTGRES_DB           - Database name (default: excalidraw)
#
# Docker Secrets Support:
#   Set VAR_NAME_FILE to a path, and the script will read the value from that file.
#   Example: POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
#
# =============================================================================

# -----------------------------------------------------------------------------
# get_secret - Read a secret from file or environment variable
# -----------------------------------------------------------------------------
# Usage: get_secret "VAR_NAME" "default_value"
#
# Priority:
#   1. Check if VAR_NAME_FILE exists and points to a readable file
#   2. Check if VAR_NAME environment variable is set
#   3. Return default_value if neither is available
#
# Example:
#   password=$(get_secret "POSTGRES_PASSWORD" "")
#   # Checks POSTGRES_PASSWORD_FILE first, then POSTGRES_PASSWORD
# -----------------------------------------------------------------------------
get_secret() {
    local var_name="$1"
    local default_value="$2"
    local file_var="${var_name}_FILE"
    
    # Check if _FILE variant is set and points to a readable file
    eval "file_path=\$$file_var"
    if [ -n "$file_path" ] && [ -f "$file_path" ]; then
        cat "$file_path"
        return
    fi
    
    # Fall back to direct environment variable
    eval "value=\$$var_name"
    if [ -n "$value" ]; then
        echo "$value"
        return
    fi
    
    # Return default value
    echo "$default_value"
}

# -----------------------------------------------------------------------------
# build_database_url - Construct PostgreSQL connection string for Prisma
# -----------------------------------------------------------------------------
# Prisma CLI requires DATABASE_URL to run migrations. This function either:
#   - Returns an existing DATABASE_URL if set
#   - Builds one from individual POSTGRES_* components
#
# The password is URL-encoded to handle special characters safely.
#
# Output format: postgresql://user:password@host:port/database?schema=public
# -----------------------------------------------------------------------------
build_database_url() {
    # Check if DATABASE_URL is already set (direct or via file)
    local direct_url
    direct_url=$(get_secret "DATABASE_URL" "")
    if [ -n "$direct_url" ]; then
        echo "$direct_url"
        return
    fi
    
    # Build from individual components
    local user password host port db
    user=$(get_secret "POSTGRES_USER" "excalidraw")
    password=$(get_secret "POSTGRES_PASSWORD" "")
    host=$(get_secret "POSTGRES_HOST" "postgres")
    port=$(get_secret "POSTGRES_PORT" "5432")
    db=$(get_secret "POSTGRES_DB" "excalidraw")
    
    # Password is required - fail early if not set
    if [ -z "$password" ]; then
        echo "ERROR: POSTGRES_PASSWORD or DATABASE_URL must be set" >&2
        exit 1
    fi
    
    # URL-encode password to handle special characters
    # This covers most common special characters that could break the URL
    encoded_password=$(echo "$password" | sed 's/%/%25/g; s/ /%20/g; s/!/%21/g; s/"/%22/g; s/#/%23/g; s/\$/%24/g; s/&/%26/g; s/'\''/%27/g; s/(/%28/g; s/)/%29/g; s/*/%2A/g; s/+/%2B/g; s/,/%2C/g; s/:/%3A/g; s/;/%3B/g; s/</%3C/g; s/=/%3D/g; s/>/%3E/g; s/?/%3F/g; s/@/%40/g; s/\[/%5B/g; s/\\/%5C/g; s/\]/%5D/g')
    
    echo "postgresql://${user}:${encoded_password}@${host}:${port}/${db}?schema=public"
}

# =============================================================================
# Main Execution
# =============================================================================

echo "=== AstraDraw API Starting ==="

# Build and export DATABASE_URL for Prisma CLI
# The URL is masked in logs to avoid exposing credentials
export DATABASE_URL=$(build_database_url)
echo "Database: $(echo $DATABASE_URL | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')"

# Run database migrations
# - First tries `prisma migrate deploy` (production-safe, applies pending migrations)
# - Falls back to `prisma db push` if migrations fail (useful for initial setup)
# - Continues even if both fail (allows manual intervention)
echo "Running database migrations..."
if npx prisma migrate deploy 2>&1; then
    echo "Migrations completed successfully"
elif npx prisma db push --accept-data-loss 2>&1; then
    echo "Database schema pushed successfully (fallback)"
else
    echo "WARNING: Migration failed, continuing anyway..."
fi

# Start the API server
# Using `exec` replaces this shell with the Node process,
# ensuring proper signal handling (SIGTERM, etc.) for container orchestration
echo "Starting API server..."
exec npm run start:prod
