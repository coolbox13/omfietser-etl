// Fixed payload for webhook test - return direct JSON structure
return [{
  json: {
    action: "process",
    shop_type: "ah",
    batch_id: "test-job-123",
    metadata: {
      triggered_by: "n8n_test",
      test: true
    }
  }
}];