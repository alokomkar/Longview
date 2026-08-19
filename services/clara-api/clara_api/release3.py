"""Production entry point for the bounded daily schedule release."""

from .main import create_app


app = create_app(release_mode="release-three")
