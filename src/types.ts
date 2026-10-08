export interface NormalizedBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface Annotation {
  id: string;
  type: 'textbox' | 'checkbox' | 'radio';
  normalizedBox: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  label?: string;
  pageIndex: number;
  radioGroup?: string;
}

export interface AnnotationsJSON {
  pages: Record<string, Annotation[]>;
}

export interface InputField {
  page_no?: number;
  page_number?: number;
  field_name?: string;
  label?: string;
  field_type?: string;
  box_2d: [number, number, number, number];
}

export function mapFieldType(fieldType?: string): 'textbox' | 'checkbox' | 'radio' {
  if (!fieldType) return 'textbox';
  const normalized = fieldType.toLowerCase().trim();
  if (normalized.includes('radio')) return 'radio';
  if (normalized === 'checkbox' || normalized.includes('checkbox') || normalized.includes('check')) return 'checkbox';
  if (normalized === 'text_input' || normalized === 'text field' || normalized.includes('text')) return 'textbox';
  return 'textbox';
}

// PDF Form Filler v1 format types
export interface PDFFormFillerV1Field {
  label: string;
  field_type: 'text_input' | 'checkbox' | 'radio';
  box_2d: [number, number, number, number];
  page_number: number;
  row_index?: number;
}

export interface PDFFormFillerV1 {
  format: 'pdf_form_filler/v1';
  template_filename?: string;
  cached_at?: string;
  updated_at?: string;
  entries: {
    analysis: {
      fields: PDFFormFillerV1Field[];
      route?: any;
      page_count?: number;
    };
    labels?: Record<string, any>;
    feedback?: Record<string, any>;
  };
}

export function isPDFFormFillerV1Format(data: any): data is PDFFormFillerV1 {
  return (
    data &&
    typeof data === 'object' &&
    data.format === 'pdf_form_filler/v1' &&
    data.entries &&
    typeof data.entries === 'object' &&
    data.entries.analysis &&
    Array.isArray(data.entries.analysis.fields)
  );
}

export function convertPDFFormFillerV1ToAnnotations(data: PDFFormFillerV1): AnnotationsJSON {
  const fields = data.entries.analysis.fields;
  const pages: Record<string, Annotation[]> = {};
  const radioGroups: Record<string, string[]> = {};

  fields.forEach((field, index) => {
    const pageNumber = field.page_number;
    const pageKey = pageNumber.toString();
    const fieldType = mapFieldType(field.field_type);
    const label = field.label || `Field ${index + 1}`;

    if (!pages[pageKey]) {
      pages[pageKey] = [];
    }

    const annotation: Annotation = {
      id: `field_${index}`,
      type: fieldType,
      normalizedBox: field.box_2d,
      label,
      pageIndex: pageNumber,
    };

    // Track radio groups
    if (fieldType === 'radio') {
      const prefix = extractRadioGroupPrefix(label);
      if (!radioGroups[prefix]) {
        radioGroups[prefix] = [];
      }
      radioGroups[prefix].push(annotation.id);
    }

    pages[pageKey].push(annotation);
  });

  // Assign radio groups
  Object.entries(radioGroups).forEach(([prefix, ids]) => {
    if (ids.length >= 2) {
      const groupName = prefix.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      Object.values(pages).flat().forEach(annotation => {
        if (ids.includes(annotation.id)) {
          annotation.radioGroup = groupName;
        }
      });
    }
  });

  return { pages };
}

export function convertAnnotationsToPDFFormFillerV1(
  annotations: AnnotationsJSON,
  templateFilename?: string
): PDFFormFillerV1 {
  const fields: PDFFormFillerV1Field[] = [];

  const fieldTypeMap: Record<string, 'text_input' | 'checkbox' | 'radio'> = {
    textbox: 'text_input',
    checkbox: 'checkbox',
    radio: 'radio',
  };

  // Sort by page number, then by position
  const allAnnotations = Object.values(annotations.pages)
    .flat()
    .sort((a, b) => {
      if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
      return a.normalizedBox[0] - b.normalizedBox[0]; // Sort by ymin
    });

  allAnnotations.forEach((annotation, index) => {
    fields.push({
      label: annotation.label || `Field ${index + 1}`,
      field_type: fieldTypeMap[annotation.type] || 'text_input',
      box_2d: annotation.normalizedBox,
      page_number: annotation.pageIndex,
      row_index: 0,
    });
  });

  const pageNumbers = new Set(allAnnotations.map(a => a.pageIndex));

  return {
    format: 'pdf_form_filler/v1',
    template_filename: templateFilename || 'document.pdf',
    cached_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    entries: {
      analysis: {
        fields,
        page_count: pageNumbers.size,
      },
      labels: {},
      feedback: {
        settled: true,
        rules: {},
      },
    },
  };
}

export function extractRadioGroupPrefix(fieldName: string): string {
  // Remove trailing "Yes", "No", "Own", "Rent", "Other" etc.
  const words = fieldName.split(' ');
  const lastWord = words[words.length - 1].toLowerCase();
  if (['yes', 'no', 'own', 'rent', 'other'].includes(lastWord)) {
    return words.slice(0, -1).join(' ');
  }
  return fieldName;
}

export function convertInputToAnnotations(input: InputField[]): AnnotationsJSON {
  const pages: Record<string, Annotation[]> = {};
  const radioGroups: Record<string, string[]> = {};

  // First pass: create annotations
  input.forEach((field, index) => {
    const pageNumber = field.page_no ?? field.page_number ?? 1;
    const pageKey = pageNumber.toString();
    const fieldType = mapFieldType(field.field_type);
    const label = field.field_name ?? field.label ?? `Field ${index + 1}`;

    if (!pages[pageKey]) {
      pages[pageKey] = [];
    }

    const annotation: Annotation = {
      id: `field_${index}`,
      type: fieldType,
      normalizedBox: field.box_2d,
      label,
      pageIndex: pageNumber,
    };

    // Track radio groups
    if (fieldType === 'radio') {
      const prefix = extractRadioGroupPrefix(label);
      if (!radioGroups[prefix]) {
        radioGroups[prefix] = [];
      }
      radioGroups[prefix].push(annotation.id);
    }

    pages[pageKey].push(annotation);
  });

  // Second pass: assign radio groups
  Object.entries(radioGroups).forEach(([prefix, ids]) => {
    if (ids.length >= 2) {
      const groupName = prefix.replace(/\s+/g, '_').toLowerCase();
      Object.values(pages).flat().forEach(annotation => {
        if (ids.includes(annotation.id)) {
          annotation.radioGroup = groupName;
        }
      });
    }
  });

  return { pages };
}

export function exportToInputFormat(annotations: AnnotationsJSON): InputField[] {
  const result: InputField[] = [];

  Object.values(annotations.pages).flat().forEach(annotation => {
    const fieldTypeMap = {
      textbox: 'Text Field',
      checkbox: 'Checkbox',
      radio: 'Radio Button',
    };

    result.push({
      page_no: annotation.pageIndex,
      field_name: annotation.label,
      field_type: fieldTypeMap[annotation.type],
      box_2d: annotation.normalizedBox,
    });
  });

  return result;
}
