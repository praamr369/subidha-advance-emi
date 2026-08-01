import os
import re

BASE_DIR = r"C:\Users\Roy35\Desktop\subidha-advance-emi\backend"
SUBS_MODELS = os.path.join(BASE_DIR, "subscriptions", "models.py")

APPS = {
    "contracts": {
        "models": {
            "Subscription": (1328, 1676),
            "RentSubscriptionProfile": (1677, 1779),
            "LeaseSubscriptionProfile": (1780, 1887),
            "ContractReferenceSequence": (1888, 1909),
            "ContractReference": (1910, 2039),
            "SubscriptionDocument": (2449, 2537),
            "DocumentAccessLog": (2538, 2574),
            "OperationalCancellation": (4120, 4231),
            "ContractAmendment": (4893, 4942),
            "ContractRecontractEvent": (4943, 5097),
            "ContractRecontractScheduleLine": (5098, 5169),
            "ContractRecontractFinancialImpactPreview": (5170, 5255),
            "SubscriptionGuarantor": (5777, 5824),
        }
    },
    "payments": {
        "models": {
            "UnifiedCollectionIdempotency": (2045, 2082),
            "RentLeaseBillingDemand": (2098, 2182),
            "RentLeaseDepositTransaction": (2204, 2448),
            "Emi": (2741, 2857),
            "Payment": (2858, 3037),
            "CustomerAdvance": (3044, 3166),
            "CustomerAdvanceAllocation": (3167, 3242),
            "PaymentReconciliation": (3265, 3387),
            "PaymentReconciliationEvent": (3388, 3427),
            "PartnerCollectionRequest": (3436, 3578),
            "FinancialLedger": (4333, 4433),
            "RecoveryCase": (5834, 5935),
            "EMIScheme": (5942, 6023),
            "EmiWaiverSettlement": (6389, 6485),
            "DepositForfeitureTaxInvoice": (6825, 6926),
        },
        "extra_files": {
            "subscriptions/models_cash_counter_session.py": ["CashDeskTimeStampedModel", "CashCounterSession", "DailyCloseRun"],
            "subscriptions/models_customer_advance_refund.py": ["CustomerAdvanceRefund"],
            "subscriptions/models_rent_lease_collection.py": ["RentLeaseCollection"]
        }
    },
    "lucky_plan": {
        "models": {
            "Batch": (1183, 1268),
            "LuckyId": (1269, 1327),
            "DrawEligibilitySnapshot": (3579, 3639),
            "DrawCommit": (3640, 3680),
            "LuckyDraw": (3681, 3842),
            "DrawAuthorisation": (6312, 6388),
        },
        "extra_files": {
            "subscriptions/models_lucky_draw.py": ["LuckyDrawBatch", "LuckyIDDraw"]
        }
    },
    "deliveries": {
        "models": {
            "SubscriptionDelivery": (2575, 2740),
            "ProductPossession": (5297, 5354),
            "RentLeaseReturnInspection": (5376, 5446),
            "AssetConditionSnapshot": (5632, 5719),
            "Delivery": (6093, 6135),
            "ProofOfDelivery": (6142, 6185),
            "Repossession": (6493, 6597),
            "DefectClaim": (6612, 6694),
            "ConsumerReturnRequest": (6705, 6818),
        }
    },
    "commissions": {
        "models": {
            "Commission": (4434, 4543),
            "CommissionPayoutBatch": (4544, 4596),
            "CommissionPayoutLine": (4597, 4638),
        }
    },
    "products_core": {
        "models": {
            "ProductCategoryMaster": (205, 241),
            "ProductSubcategoryMaster": (242, 274),
            "ProductUnitOfMeasureMaster": (275, 298),
            "Product": (299, 514),
            "ProductRelationship": (5273, 5296),
            "RentalAsset": (5509, 5631),
        }
    }
}

def setup_apps():
    with open(SUBS_MODELS, "r", encoding="utf-8") as f:
        subs_lines = f.readlines()
        
    for app_name, app_data in APPS.items():
        app_dir = os.path.join(BASE_DIR, app_name)
        os.makedirs(app_dir, exist_ok=True)
        os.makedirs(os.path.join(app_dir, "services"), exist_ok=True)
        os.makedirs(os.path.join(app_dir, "migrations"), exist_ok=True)
        
        # __init__.py
        open(os.path.join(app_dir, "__init__.py"), "w").close()
        open(os.path.join(app_dir, "services", "__init__.py"), "w").close()
        open(os.path.join(app_dir, "migrations", "__init__.py"), "w").close()
        
        # apps.py
        with open(os.path.join(app_dir, "apps.py"), "w", encoding="utf-8") as f:
            f.write(f"""from django.apps import AppConfig\n\nclass {app_name.replace('_', ' ').title().replace(' ', '')}Config(AppConfig):\n    default_auto_field = 'django.db.models.BigAutoField'\n    name = '{app_name}'\n""")
            
        # models.py
        model_code = []
        model_code.append("from django.db import models\n")
        model_code.append("from django.conf import settings\n")
        model_code.append("from subscriptions.enums import *\n")
        model_code.append("from subscriptions.base_models import *\n\n")
        
        models_in_app = set(app_data.get("models", {}).keys())
        
        for model_name, (start, end) in app_data.get("models", {}).items():
            model_lines = subs_lines[start-1:end]
            model_code.extend(model_lines)
            model_code.append("\n")
            
        # extra files
        for extra_file, extra_models in app_data.get("extra_files", {}).items():
            models_in_app.update(extra_models)
            with open(os.path.join(BASE_DIR, extra_file.replace("/", os.sep)), "r", encoding="utf-8") as f:
                content = f.read()
                # Extremely hacky parsing, just matching class blocks
                # We will just write a regex to pull the class
                for extra_model in extra_models:
                    pattern = f"class {extra_model}\\(.*?(?=^class |\\Z)"
                    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
                    if match:
                        model_code.append(match.group(0))
                        model_code.append("\n")
                        
        code_str = "".join(model_code)
        
        # Fix ForeignKey references
        def fk_replacer_comma(match):
            m_type = match.group(1)
            m_target = match.group(2)
            
            if m_target.startswith("'") or m_target.startswith('"'):
                return match.group(0)
            
            if "settings" in m_target or m_target == "self":
                return match.group(0)
                
            if m_target in models_in_app:
                return match.group(0)
                
            return f"{m_type}('subscriptions.{m_target}',"

        def fk_replacer_nocomma(match):
            m_type = match.group(1)
            m_target = match.group(2)
            
            if m_target.startswith("'") or m_target.startswith('"'):
                return match.group(0)
            
            if "settings" in m_target or m_target == "self":
                return match.group(0)
                
            if m_target in models_in_app:
                return match.group(0)
                
            return f"{m_type}('subscriptions.{m_target}')"

        code_str = re.sub(r"(ForeignKey|OneToOneField|ManyToManyField)\(\s*([A-Za-z0-9_]+)\s*,", fk_replacer_comma, code_str)
        code_str = re.sub(r"(ForeignKey|OneToOneField|ManyToManyField)\(\s*([A-Za-z0-9_]+)\s*\)", fk_replacer_nocomma, code_str)

        # Meta table addition
        for model_name in list(models_in_app):
            # check if db_table is already present in this class
            # We'll just look for class Meta: and if it exists, check for db_table
            # If not, add class Meta: \n        db_table = 'subscriptions_lowercasemodelname'
            
            # This is complex to do with simple regex, let's use a python script to fix the models code later if needed
            # actually I can just do a pass over the generated models.
            pass
            
        with open(os.path.join(app_dir, "models.py"), "w", encoding="utf-8") as f:
            f.write(code_str)

setup_apps()
