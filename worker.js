importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs'); // Import TensorFlow.js

let model;

// Function to handle messages from the main script
self.addEventListener('message', async (event) => {
  if (event.data.type === 'loadModel') {
    const modelUrl = event.data.modelUrl;
    try {
      model = await tf.loadGraphModel(modelUrl);
      self.postMessage({ type: 'modelLoaded' });
    } catch (error) {
      console.error('Error loading model:', error);
      self.postMessage({ type: 'modelError', error });
    }
  } else if (event.data.type === 'enhanceFrame' && model) {
    const { tensor } = event.data;

    // Process the tensor (color space conversion, resizing, and model prediction)
    const inputTensor = tf.tensor(tensor.data, tensor.shape);

    // Convert RGB to YCbCr
    let [R, G, B] = tf.split(inputTensor, 3, 2);
    let Y = R.mul(0.299).add(G.mul(0.587)).add(B.mul(0.114));
    let Cr = R.sub(Y).mul(0.713).add(0.5);
    let Cb = B.sub(Y).mul(0.564).add(0.5);

    // Resize only Y channel
    Y = Y.expandDims(3); // Add the channel dimension
    Y = tf.image.resizeBilinear(Y, [240, 480]);
    Y = Y.expandDims(0); // Add the batch dimension

    let outputTensor;
    try {
      outputTensor = await model.predict(Y);

      // Resize Cr and Cb to match the Y output dimensions
      Cr = Cr.resizeBilinear([outputTensor.shape[1], outputTensor.shape[2]]);
      Cb = Cb.resizeBilinear([outputTensor.shape[1], outputTensor.shape[2]]);

      // Concatenate along the channel dimension
      let YCrCb = tf.concat([outputTensor, Cr, Cb], 3);

      // Convert YCbCr back to RGB
      outputTensor = tf.tidy(() => {
        let Y = YCrCb.slice([0, 0, 0, 0], [-1, -1, -1, 1]);
        let Cr = YCrCb.slice([0, 0, 0, 1], [-1, -1, -1, 1]).sub(0.5);
        let Cb = YCrCb.slice([0, 0, 0, 2], [-1, -1, -1, 1]).sub(0.5);
        R = Y.add(Cr.mul(1.403));
        G = Y.sub(Cr.mul(0.344)).sub(Cb.mul(0.714));
        B = Y.add(Cb.mul(1.773));
        return tf.stack([R, G, B], 3).squeeze(0).clipByValue(0, 1);
      });

      // Send the processed tensor back to the main script
      self.postMessage({ type: 'frameEnhanced', outputTensor }, [outputTensor.buffer]); 
    } catch (error) {
      console.error('Error during prediction:', error);
      self.postMessage({ type: 'predictionError', error });
    } finally {
      // Dispose of tensors to free memory
      inputTensor.dispose();
      Y.dispose();
      Cr.dispose();
      Cb.dispose();
      if (outputTensor) {
        outputTensor.dispose();
      }
    } 
  }
});