import csv
import os
from decimal import Decimal, InvalidOperation
from django.core.management.base import BaseCommand
from django.db import connection
from subscriptions.models_address import PincodeDatabase


class Command(BaseCommand):
    help = 'Load pincode database from CSV file (supports simple and India Post format)'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str, help='Path to CSV file with pincode data')
        parser.add_argument(
            '--state',
            type=str,
            default=None,
            help='Filter to specific state (e.g., "TELANGANA", "WEST BENGAL")',
        )

    def detect_format(self, fieldnames):
        fieldnames_lower = [f.lower() for f in fieldnames]
        if 'circlename' in fieldnames_lower or 'officename' in fieldnames_lower:
            return 'india_post'
        elif 'postal_code' in fieldnames_lower:
            return 'simple'
        return 'unknown'

    def safe_decimal(self, val, max_int_digits=3, decimal_places=6):
        if not val or val.strip().upper() == 'NA':
            return None
        try:
            d = Decimal(val.strip())
            limit = Decimal(10 ** max_int_digits)
            if d >= limit or d <= -limit:
                return None
            return round(d, decimal_places)
        except (InvalidOperation, ValueError, TypeError):
            return None

    def handle(self, *args, **options):
        csv_file = options['csv_file']
        state_filter = options.get('state', '').upper().strip() if options.get('state') else None

        if not os.path.exists(csv_file):
            self.stdout.write(self.style.ERROR(f'File not found: {csv_file}'))
            return

        self.stdout.write(f'Loading pincodes from: {csv_file}')
        if state_filter:
            self.stdout.write(f'Filtering by state: {state_filter}')

        parsed = {}
        error_count = 0
        skipped_count = 0

        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            format_type = self.detect_format(reader.fieldnames)
            self.stdout.write(f'Detected format: {format_type}')

            for row_num, row in enumerate(reader, start=2):
                try:
                    if format_type == 'india_post':
                        postal_code = str(row.get('pincode', '')).strip()
                        city = row.get('officename', '').strip()
                        district = row.get('district', '').strip()
                        state = row.get('statename', '').strip().upper()
                        region = row.get('regionname', '').strip()
                        lat_str = row.get('latitude', '').strip()
                        lon_str = row.get('longitude', '').strip()
                    else:
                        postal_code = str(row.get('postal_code', '')).strip()
                        city = row.get('city', '').strip()
                        district = row.get('district', '').strip()
                        state = row.get('state', '').strip().upper()
                        region = row.get('region', '').strip()
                        lat_str = row.get('latitude', '').strip()
                        lon_str = row.get('longitude', '').strip()

                    if not postal_code or len(postal_code) != 6 or not postal_code.isdigit():
                        error_count += 1
                        continue
                    if not city or not district or not state:
                        error_count += 1
                        continue

                    if state_filter and state != state_filter:
                        skipped_count += 1
                        continue

                    lat = self.safe_decimal(lat_str)
                    lon = self.safe_decimal(lon_str)

                    if postal_code not in parsed:
                        parsed[postal_code] = {
                            'city': city[:100],
                            'district': district[:100],
                            'state': state[:100],
                            'region': region[:100] if region else '',
                            'latitude': lat,
                            'longitude': lon,
                        }
                    else:
                        existing = parsed[postal_code]
                        if lat and not existing['latitude']:
                            existing['latitude'] = lat
                        if lon and not existing['longitude']:
                            existing['longitude'] = lon

                except Exception:
                    error_count += 1

        self.stdout.write(f'Parsed {len(parsed)} unique pincodes from {row_num} rows')
        if skipped_count:
            self.stdout.write(f'Skipped (state filter): {skipped_count}')
        if error_count:
            self.stdout.write(f'Parse errors: {error_count}')

        existing_pks = set(
            PincodeDatabase.objects.values_list('postal_code', flat=True)
        )

        to_create = []
        to_update = []
        for pk, data in parsed.items():
            obj = PincodeDatabase(postal_code=pk, **data)
            if pk in existing_pks:
                to_update.append(obj)
            else:
                to_create.append(obj)

        created_count = 0
        if to_create:
            BATCH = 2000
            for i in range(0, len(to_create), BATCH):
                batch = to_create[i:i + BATCH]
                PincodeDatabase.objects.bulk_create(batch, ignore_conflicts=True)
                created_count += len(batch)
                if (i // BATCH) % 5 == 0:
                    self.stdout.write(f'  Created {created_count}/{len(to_create)}...')

        updated_count = 0
        if to_update:
            BATCH = 2000
            update_fields = ['city', 'district', 'state', 'region', 'latitude', 'longitude']
            for i in range(0, len(to_update), BATCH):
                batch = to_update[i:i + BATCH]
                PincodeDatabase.objects.bulk_update(batch, update_fields, batch_size=BATCH)
                updated_count += len(batch)
                if (i // BATCH) % 5 == 0:
                    self.stdout.write(f'  Updated {updated_count}/{len(to_update)}...')

        total = PincodeDatabase.objects.count()

        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(self.style.SUCCESS('Pincode database loaded successfully!'))
        self.stdout.write('=' * 70)
        self.stdout.write(f'Created: {created_count}')
        self.stdout.write(f'Updated: {updated_count}')
        self.stdout.write(f'Parse errors: {error_count}')
        self.stdout.write(f'Total pincodes in database: {total}')

        from django.db.models import Count
        states = PincodeDatabase.objects.values('state').annotate(
            count=Count('postal_code')
        ).order_by('-count')[:15]

        self.stdout.write('\nTop 15 states by pincode count:')
        for item in states:
            self.stdout.write(f'  {item["state"]}: {item["count"]} pincodes')
        self.stdout.write('=' * 70 + '\n')
