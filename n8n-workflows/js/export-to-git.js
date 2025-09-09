/**
 * N8N Workflow Export Script
 * Run this inside N8N as a workflow to automatically export all workflows to files
 */

// N8N Workflow Node - Code Node
// This exports all workflows to individual JSON files

const fs = require('fs').promises;
const path = require('/home/node/exports');

async function exportWorkflows() {
  try {
    // Get all workflows (this would be called via N8N API in actual workflow)
    const workflows = $input.all();
    
    for (const workflow of workflows) {
      const workflowData = workflow.json;
      const workflowName = workflowData.name.replace(/[^a-z0-9]/gi, '_');
      const filename = `${workflowName}_${Date.now()}.json`;
      const filePath = `/home/node/exports/${filename}`;
      
      await fs.writeFile(filePath, JSON.stringify(workflowData, null, 2));
      console.log(`Exported: ${filename}`);
    }
    
    return { success: true, message: 'All workflows exported successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

return exportWorkflows();