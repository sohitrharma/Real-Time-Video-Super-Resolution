import os
import tensorflow as tf
from onnx_tf.backend import prepare
import onnx


def convert_onnx_to_tfjs(onnx_path, tfjs_path):
    # Load ONNX model
    onnx_model = onnx.load(onnx_path)

    # Convert ONNX model to TensorFlow model using onnx-tf
    tf_rep = prepare(onnx_model)

    # Export the TensorFlow model to a directory
    saved_model_path = "saved_model_dir"
    tf_rep.export_graph(saved_model_path)

    # Convert TensorFlow model to TensorFlow.js format using TensorFlow.js converter
    os.system(
        f"tensorflowjs_converter --input_format=tf_saved_model --output_node_names='{tf_rep.outputs[0]}' {saved_model_path} {tfjs_path}")


# Example usage
onnx_model_path = "2x90scartoon_v1_evA-01.onnx"
tfjs_output_path = "/output"
convert_onnx_to_tfjs(onnx_model_path, tfjs_output_path)
