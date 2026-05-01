const tf = require('@tensorflow/tfjs-node');

async function test() {
    try {
        console.log("Loading model...");
        const handler = tf.io.fileSystem('./dist/model/model.json');
        const model = await tf.loadLayersModel(handler);
        console.log("SUCCESS!");
    } catch(e) {
        console.error("ERROR:");
        console.error(e);
    }
}
test();
