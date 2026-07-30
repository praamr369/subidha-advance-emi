import csv
import os
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from subscriptions.models_address import PincodeDatabase


class Command(BaseCommand):
    help = 'Load comprehensive pincode database from CSV file (India Post format)'

    def add_arguments(self, parser):
        parser.add_argument('csv_file', type=str, help='Path to CSV file with pincode data')
        parser.add_argument(
            '--state',
            type=str,
            default=None,
            help='Filter to specific state (e.g., "TELANGANA", "WEST BENGAL")',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        csv_file = options['csv_file']
        state_filter = options.get('state', '').upper()

        if not os.path.exists(csv_file):
            self.stdout.write(self.style.ERROR(f'File not found: {csv_file}'))
            return

        self.stdout.write(f'Loading pincodes from: {csv_file}')
        if state_filter:
            self.stdout.write(f'Filtering by state: {state_filter}')

        created = 0
        updated = 0
        errors = 0
        skipped = 0

        try:
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                # Expected columns: circlename, regionname, divisionname, officename, pincode,
                #                  officetype, delivery, district, statename, latitude, longitude

                for row_num, row in enumerate(reader, start=2):
                    try:
                        # Extract fields
                        pincode = str(row.get('pincode', '').strip())
                        city = row.get('officename', '').strip()
                        district = row.get('district', '').strip()
                        state = row.get('statename', '').strip().upper()
                        region = row.get('regionname', '').strip()

                        # Parse latitude and longitude
                        lat_str = row.get('latitude', '').strip()
                        lon_str = row.get('longitude', '').strip()

                        # Skip if NA or invalid
                        if lat_str.upper() == 'NA' or lon_str.upper() == 'NA':
                            latitude = None
                            longitude = None
                        else:
                            try:
                                latitude = Decimal(lat_str)
                                longitude = Decimal(lon_str)
                            except (ValueError, TypeError):
                                latitude = None
                                longitude = None

                        # Validate pincode format (6 digits)
                        if not pincode or len(pincode) != 6 or not pincode.isdigit():
                            errors += 1
                            if errors <= 10:  # Log first 10 errors
                                self.stdout.write(
                                    self.style.WARNING(
                                        f'Row {row_num}: Invalid pincode format: {pincode}'
                                    )
                                )
                            continue

                        # Filter by state if specified
                        if state_filter and state != state_filter:
                            skipped += 1
                            continue

                        # Validate required fields
                        if not city or not district or not state:
                            errors += 1
                            continue

                        # Try to get or create the pincode record
                        obj, created_flag = PincodeDatabase.objects.update_or_create(
                            postal_code=pincode,
                            defaults={
                                'city': city[:100],  # Truncate if needed
                                'district': district[:100],
                                'state': state[:50],
                                'region': region[:100] if region else '',
                                'latitude': latitude,
                                'longitude': longitude,
                            },
                        )

                        if created_flag:
                            created += 1
                        else:
                            updated += 1

                    except Exception as e:
                        errors += 1
                        if errors <= 10:
                            self.stdout.write(
                                self.style.WARNING(f'Row {row_num}: Error processing row: {str(e)}')
                            )
                        continue

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error reading CSV file: {str(e)}'))
            return

        # Print summary
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('Pincode database loaded successfully!'))
        self.stdout.write('=' * 60)
        self.stdout.write(f'Created: {created}')
        self.stdout.write(f'Updated: {updated}')
        self.stdout.write(f'Errors: {errors}')
        if skipped:
            self.stdout.write(f'Skipped (state filter): {skipped}')
        self.stdout.write('=' * 60 + '\n')

        total_in_db = PincodeDatabase.objects.count()
        self.stdout.write(f'Total pincodes in database: {total_in_db}')

        # Stats by state
        states = (
            PincodeDatabase.objects.values('state')
            .annotate(count=__import__('django.db.models', fromlist=['Count']).Count('id'))
            .order_by('-count')[:10]
        )
        self.stdout.write('\nTop 10 states by pincode count:')
        for item in states:
            self.stdout.write(f'  {item["state"]}: {item["count"]} pincodes')
