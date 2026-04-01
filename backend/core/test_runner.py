from django.test.runner import DiscoverRunner


class ProjectTestRunner(DiscoverRunner):
    """
    Project-level test discovery for the top-level backend/tests package.

    Django's default no-label discovery only searches installed apps. This repo
    keeps its backend suite in a dedicated top-level tests package, so bare
    `manage.py test` needs explicit default labels.
    """

    default_test_labels = ["tests.api", "tests.domain"]

    def build_suite(self, test_labels=None, *args, **kwargs):
        labels = list(test_labels or [])
        if not labels:
            labels = list(self.default_test_labels)
        return super().build_suite(labels, *args, **kwargs)
