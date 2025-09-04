#!/usr/bin/env python
"""
Batch Product Categorizer

This script processes a list of product titles and generates category predictions
using a pre-trained ML model. It's designed to be called from the TypeScript
processor to generate predictions that will be used by the hybrid category service.

Usage:
  python batch_categorize.py input_file.json output_file.json

Arguments:
  input_file.json - JSON file containing an array of product titles
  output_file.json - Output file to write predictions to
"""

import json
import torch
import pickle
from transformers import AutoTokenizer, AutoModel
import sys
import os
from tqdm import tqdm
import re

# Define model class (must match the one used during training)
class ProductCategoryClassifier(torch.nn.Module):
    def __init__(self, num_classes):
        super(ProductCategoryClassifier, self).__init__()
        self.bert = AutoModel.from_pretrained("GroNLP/bert-base-dutch-cased")  # Initialize BERT immediately
        self.dropout = torch.nn.Dropout(0.1)
        self.classifier = torch.nn.Linear(768, num_classes)  # 768 is BERT's hidden size

    def forward(self, input_ids, attention_mask):
        # Get BERT output
        outputs = self.bert(input_ids=input_ids, attention_mask=attention_mask)
        pooled_output = outputs.pooler_output  # [CLS] token output
        
        # Apply dropout and classify
        x = self.dropout(pooled_output)
        logits = self.classifier(x)
        return logits

def load_model():
    """Load the trained model, tokenizer, and label encoder"""
    print("Loading model and tokenizer...")

    # Set up device - use MPS (Apple Silicon) if available
    device = torch.device("mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Determine model directory based on script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(os.path.dirname(script_dir), "saved_models")

    if not os.path.exists(model_dir):
        raise FileNotFoundError(f"Model directory not found at {model_dir}")

    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained("GroNLP/bert-base-dutch-cased")

    # Load label encoder
    with open(os.path.join(model_dir, "label_encoder.pkl"), "rb") as f:
        label_encoder = pickle.load(f)

    # Initialize model with correct number of classes
    model = ProductCategoryClassifier(len(label_encoder.classes_))

    # Load trained weights
    model_path = os.path.join(model_dir, "best_model.pt")

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found at {model_path}")

    checkpoint = torch.load(model_path, map_location=device)
    model.load_state_dict(checkpoint["model_state_dict"], strict=False)  # Load weights after BERT is initialized
    model.to(device)
    model.eval()

    print(f"Model loaded successfully. Accuracy: {checkpoint.get('accuracy', 'N/A')}")

    return model, tokenizer, label_encoder, device

def clean_title(title):
    """Clean and normalize product titles"""
    if not title:
        return ""

    # Convert to lowercase
    title = title.lower()

    # Replace special characters with spaces
    title = re.sub(r'[^\w\s]', ' ', title)

    # Normalize whitespace
    title = re.sub(r'\s+', ' ', title).strip()

    return title

def predict_categories(titles, model, tokenizer, label_encoder, device, batch_size=32):
    """
    Predict categories for a list of product titles.

    Args:
        titles: List of product titles
        model: Trained model
        tokenizer: BERT tokenizer
        label_encoder: Label encoder
        device: Computation device
        batch_size: Batch size for processing

    Returns:
        Dictionary mapping titles to predictions
    """
    results = {}
    cleaned_titles = [clean_title(title) for title in titles]

    print(f"Processing {len(titles)} products in batches of {batch_size}...")

    # Process in batches
    for i in tqdm(range(0, len(titles), batch_size)):
        batch_titles = cleaned_titles[i:i+batch_size]
        original_batch_titles = titles[i:i+batch_size]

        # Skip empty titles
        if not any(batch_titles):
            continue

        # Tokenize
        try:
            encodings = tokenizer(
                batch_titles,
                truncation=True,
                padding='max_length',
                max_length=128,
                return_tensors='pt'
            )
        except Exception as e:
            print(f"Error tokenizing batch: {e}")
            continue

        # Predict
        try:
            with torch.no_grad():
                input_ids = encodings['input_ids'].to(device)
                attention_mask = encodings['attention_mask'].to(device)
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                predictions = torch.softmax(outputs, dim=1)
                confidence, predicted_classes = torch.max(predictions, dim=1)

                # Store results with original titles as keys
                for j, (pred_idx, conf) in enumerate(zip(predicted_classes, confidence)):
                    if j >= len(original_batch_titles):
                        continue

                    title = original_batch_titles[j]
                    results[title] = {
                        'category': label_encoder.classes_[pred_idx.item()],
                        'confidence': float(conf.item()),
                        'all_probabilities': {
                            label_encoder.classes_[idx]: float(prob)
                            for idx, prob in enumerate(predictions[j].cpu().numpy())
                        }
                    }
        except Exception as e:
            print(f"Error during prediction: {e}")
            continue

    return results

def main():
    """Main entry point"""
    # Check arguments
    if len(sys.argv) != 3:
        print("Usage: python batch_categorize.py input.json output.json")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    # Load input data
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            input_data = json.load(f)

        if not isinstance(input_data, list):
            print("Error: Input file must contain a JSON array of strings")
            sys.exit(1)

        titles = input_data
        print(f"Loaded {len(titles)} product titles")
    except Exception as e:
        print(f"Error loading input file: {e}")
        sys.exit(1)

    try:
        # Load model and predict
        model, tokenizer, label_encoder, device = load_model()
        predictions = predict_categories(titles, model, tokenizer, label_encoder, device)

        # Save results
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(predictions, f, ensure_ascii=False, indent=2)

        print(f"Successfully categorized {len(predictions)} products")
        print(f"Predictions saved to {output_file}")

    except Exception as e:
        print(f"Error during processing: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
