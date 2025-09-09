// Analyze all test results
const allInputs = $input.all();
const results = {};

// Process each test result
allInputs.forEach((input, index) => {
  const nodeName = input.json.$node || `test_${index}`;
  const response = input.json;
  
  results[nodeName] = {
    success: !response.error && response.status !== 'error',
    status_code: response.status || 'unknown',
    response: response,
    endpoint: response.url || 'unknown'
  };
});

// Find working endpoint
const workingEndpoints = Object.keys(results).filter(key => results[key].success);
const failedEndpoints = Object.keys(results).filter(key => !results[key].success);

console.log('Test Results Summary:');
console.log('Working endpoints:', workingEndpoints);
console.log('Failed endpoints:', failedEndpoints);

return [{
  json: {
    summary: {
      total_tests: allInputs.length,
      working_endpoints: workingEndpoints.length,
      failed_endpoints: failedEndpoints.length
    },
    working: workingEndpoints,
    failed: failedEndpoints,
    detailed_results: results,
    recommendation: workingEndpoints.length > 0 ? 
      `Use endpoint: ${workingEndpoints[0]}` : 
      'No working endpoints found - check processor status'
  }
}];
