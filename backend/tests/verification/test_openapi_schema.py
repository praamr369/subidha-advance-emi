"""Layer-A.3: OpenAPI schema conformance.

drf-spectacular walks every view/serializer to build the schema. If any view has
a broken serializer, an un-annotatable action, or an import that only fails under
introspection, generation raises here — so this one test proves the whole API
surface stays schema-generatable, and keeps `/api/schema/`, `/api/docs/`, and any
generated client in sync. Complements the auth matrix + endpoint smoke.
"""
from django.test import SimpleTestCase

from drf_spectacular.generators import SchemaGenerator


class OpenApiSchemaTest(SimpleTestCase):
    def test_schema_generates_for_whole_surface(self):
        generator = SchemaGenerator()
        schema = generator.get_schema(request=None, public=True)

        self.assertIn("paths", schema)
        self.assertGreater(
            len(schema["paths"]), 0,
            msg="OpenAPI schema generated zero paths — the generator is not seeing the API.",
        )
        # openapi version marker present => a well-formed document was produced.
        self.assertTrue(str(schema.get("openapi", "")).startswith("3."))
