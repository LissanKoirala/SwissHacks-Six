from workbench.publisher_logos import publisher_logo_urls, resolve_publisher_domain


def test_bloomberg_from_placeholder_url():
    domain = resolve_publisher_domain("Bloomberg", "https://example.com/pdd-labour")
    assert domain == "bloomberg.com"
    urls = publisher_logo_urls("Bloomberg", "https://example.com/pdd-labour")
    assert urls[0] == "https://logo.clearbit.com/bloomberg.com"


def test_reuters_health():
    assert resolve_publisher_domain("Reuters Health", "https://example.com/x") == "reuters.com"


def test_real_url_used_when_source_unknown():
    assert (
        resolve_publisher_domain("Some Local Paper", "https://www.utahindependent.com/story")
        == "utahindependent.com"
    )


def test_placeholder_url_without_source_map():
    assert resolve_publisher_domain("Unknown Wire", "https://example.com/x") is None
