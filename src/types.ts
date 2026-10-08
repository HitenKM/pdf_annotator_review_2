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
  const normalized = fieldType.toLowerCase();
  if (normalized.includes('radio')) return 'radio';
  if (normalized.includes('checkbox') || normalized.includes('check')) return 'checkbox';
  return 'textbox';
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
