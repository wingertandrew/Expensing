#!/bin/sh
set -e

echo "🚀 Starting TaxHacker..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until npx prisma db push --skip-generate 2>/dev/null; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "✅ Database is ready!"

# Run migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy || true

echo "🎉 TaxHacker is ready!"

# Start the application
exec "$@"
