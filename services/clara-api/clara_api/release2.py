"""Production entry point for review-first Clara schedule changes."""

from .main import create_app


app = create_app(release_mode="release-two")
