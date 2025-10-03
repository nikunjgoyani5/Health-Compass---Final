// Minimal Node → Python integration using child_process
// Requires Python installed and available as `python3` on PATH

const { spawn } = require('child_process');
const path = require('path');

function callPythonBridge(payload) {
  return new Promise((resolve, reject) => {
    const bridgePath = path.join(__dirname, '..', 'scripts', 'ai_bridge.py');
    const proc = spawn('python3', [bridgePath], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()))

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `Bridge exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) return reject(new Error(parsed.error || 'Unknown bridge error'));
        resolve(parsed.data);
      } catch (e) {
        reject(e);
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

// Example usage
if (require.main === module) {
  (async () => {
    try {
      const data = await callPythonBridge({ query: 'What is vitamin C?' });
      console.log('AI response:', data);
    } catch (err) {
      console.error('Bridge error:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { callPythonBridge };


