# Prebuilt packages

Architecture-independent `.ipk` files, installable on any OpenWrt 21.02+ router.

They are committed here (rather than only attached to a release) so that a
router can fetch them straight over `https://raw.githubusercontent.com/...`
without needing the GitHub API.

Rebuild them from source with:

    python scripts/build_ipk.py
