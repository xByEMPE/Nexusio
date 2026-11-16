import numpy as np
import pytest

from nexus_desktop.vision.segmenter import BladeSegmenter, bounding_box, find_model, largest_contour


def test_find_model_returns_first_existing(tmp_path):
    a = tmp_path / "a.onnx"
    b = tmp_path / "b.onnx"
    b.write_bytes(b"x")
    assert find_model([a, b]) == b


def test_find_model_none_when_missing(tmp_path):
    assert find_model([tmp_path / "a.onnx", tmp_path / "b.onnx"]) is None


def test_bounding_box_of_empty_mask_is_zeroes():
    assert bounding_box(np.zeros((20, 30), np.uint8)) == (0, 0, 0, 0)


def test_bounding_box_of_blob():
    m = np.zeros((20, 30), np.uint8)
    m[5:10, 8:20] = 255
    assert bounding_box(m) == (8, 5, 12, 5)


def test_predict_returns_mask_same_size(tmp_path):
    pytest.importorskip("onnxruntime", reason="onnxruntime no instalado")
    onnx = pytest.importorskip("onnx", reason="paquete onnx no instalado")
    from onnx import TensorProto, helper

    # Modelo mínimo: media de los 3 canales -> 1 canal (logits).
    node = helper.make_node("ReduceMean", ["x"], ["y"], axes=[1], keepdims=1)
    graph = helper.make_graph(
        [node], "g",
        [helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 3, 512, 512])],
        [helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 1, 512, 512])],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    model.ir_version = 8
    path = tmp_path / "m.onnx"
    onnx.save(model, str(path))

    seg = BladeSegmenter(path)
    img = np.full((40, 60, 3), 255, np.uint8)  # blanco -> logits > 0
    mask = seg.predict(img)
    assert mask.shape == (40, 60)
    assert mask.dtype == np.uint8
    assert set(np.unique(mask)) <= {0, 255}
    assert (mask == 255).all()
    black = seg.predict(np.zeros((40, 60, 3), np.uint8))
    assert (black == 0).all()


def test_bounding_box_ignores_small_specks():
    m = np.zeros((100, 200), np.uint8)
    m[20:60, 50:120] = 255
    m[2:4, 2:4] = 255
    m[95:97, 190:192] = 255
    assert bounding_box(m) == (50, 20, 70, 40)


def test_largest_contour_none_for_empty_mask():
    assert largest_contour(np.zeros((10, 10), np.uint8)) is None


def test_missing_model_raises_file_not_found(tmp_path):
    pytest.importorskip("onnxruntime")
    with pytest.raises(FileNotFoundError):
        BladeSegmenter(tmp_path / "no.onnx")
