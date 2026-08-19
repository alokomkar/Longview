"""Production entry point for reviewed research and versioned Plan Briefs."""

from .main import create_app


app = create_app(release_mode="release-five")
