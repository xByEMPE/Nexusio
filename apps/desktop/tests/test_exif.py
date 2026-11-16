from nexus_desktop.domain.exif import num


def test_num_parses_signed_strings():
    assert num("+102.977") == 102.977 and num("-1.0") == -1.0 and num(None) is None


def test_num_accepts_numbers_and_rejects_garbage():
    assert num(3) == 3.0 and num(2.5) == 2.5
    assert num("abc") is None and num("") is None


def test_num_rejects_non_finite():
    assert num(float("nan")) is None and num(float("inf")) is None and num("-inf") is None and num("nan") is None
