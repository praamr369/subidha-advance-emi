import json

replacements = {
    "subscriptions.branch": "branch_control.branch",
    "subscriptions.businesspolicy": "finance_control.businesspolicy",
    "subscriptions.businessprofile": "business_setup.businessprofile",
    "subscriptions.businessrulepolicy": "business_setup.businessrulepolicy",
    "subscriptions.chartaccount": "accounting.chartofaccount",
    "subscriptions.documentprintsettings": "business_setup.documentprintsettings",
    "subscriptions.financeaccount": "accounting.financeaccount",
    "subscriptions.plantemplate": "growth.plantemplate",
    "subscriptions.policygovernancemetadata": "business_setup.policygovernancemetadata",
    "subscriptions.policypage": "business_setup.policypage",
}

with open("backend/fixtures/production_bootstrap.json", "r") as f:
    data = json.load(f)

new_data = []
for item in data:
    model = item.get("model")
    if model == "subscriptions.cashdesk":
        continue  # Remove entirely
    if model in replacements:
        item["model"] = replacements[model]
    new_data.append(item)

with open("backend/fixtures/production_bootstrap.json", "w") as f:
    json.dump(new_data, f, indent=2)

print("Fixture updated.")
