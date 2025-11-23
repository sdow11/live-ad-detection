#!/bin/bash

# Fix validation errors by replacing object parameters with string arrays

cd /Users/yahm/Desktop/done_9_20_25/live-ad-detection/services/content-platform/src/middleware

# Replace ValidationError patterns
sed -i '' 's/throw new ValidationError(\([^,]*\), {[[:space:]]*field: \([^,]*\),.*});/throw new ValidationError(\1, [\2]);/g' validation.ts

# Remove any remaining object patterns
sed -i '' 's/throw new ValidationError(\([^,]*\), {[^}]*});/throw new ValidationError(\1, ['\''field'\'']);/g' validation.ts

echo "Fixed validation errors"