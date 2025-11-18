#!/usr/bin/env python3
"""
Generate a professional RoHS certificate PDF from CSV data.
This script creates a realistic certificate that CORA can parse.
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
import csv
from datetime import datetime
import os

def create_rohs_certificate(csv_path, output_path):
    """Create a professional RoHS compliance certificate PDF."""

    # Create PDF
    pdf = SimpleDocTemplate(output_path, pagesize=letter,
                          topMargin=0.5*inch, bottomMargin=0.5*inch)
    elements = []

    # Styles
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a472a'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )

    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#2d5016'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica'
    )

    header_style = ParagraphStyle(
        'Header',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.grey,
        alignment=TA_RIGHT
    )

    # Header - Company Info
    elements.append(Paragraph('ZENTECH COMPONENTS GmbH', header_style))
    elements.append(Paragraph('Berliner Str. 45, 10115 Berlin, Germany', header_style))
    elements.append(Paragraph('Tel: +49 30 1234567 | cert@zentech.de', header_style))
    elements.append(Spacer(1, 0.3*inch))

    # Title
    elements.append(Paragraph('RoHS COMPLIANCE CERTIFICATE', title_style))
    elements.append(Paragraph('Restriction of Hazardous Substances Directive 2011/65/EU', subtitle_style))
    elements.append(Spacer(1, 0.2*inch))

    # Certificate Info Box
    cert_info = [
        ['Certificate Number:', 'ZTC-ROHS-2024-1108'],
        ['Issue Date:', datetime.now().strftime('%B %d, %Y')],
        ['Valid Until:', 'November 30, 2025'],
        ['Testing Laboratory:', 'TÜV Rheinland (Accredited ISO/IEC 17025)'],
        ['Test Method:', 'IEC 62321-1:2013'],
        ['Supplier:', 'Zentech Components GmbH']
    ]

    info_table = Table(cert_info, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#2d5016')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 0.3*inch))

    # Test Results Header
    elements.append(Paragraph('<b>TEST RESULTS - SUBSTANCE ANALYSIS</b>', styles['Heading2']))
    elements.append(Spacer(1, 0.15*inch))

    # Read CSV data and create table
    data = [['Part Number', 'Substance', 'Concentration', 'RoHS Limit (ppm)', 'Status']]

    with open(csv_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            conc = row['concentration'] if row['concentration'] else 'ND'
            unit = row['unit']
            limit = row['threshold_ppm'] + ' ppm' if row['threshold_ppm'] else 'N/A'

            # Determine status
            if not row['concentration']:
                status = 'ND'
                conc_display = 'ND (Not Detected)'
            else:
                try:
                    # Convert to ppm for comparison
                    conc_val = float(row['concentration'])
                    if unit == '%':
                        conc_ppm = conc_val * 10000
                        conc_display = f"{conc} % ({conc_ppm:.0f} ppm)"
                    elif unit == 'mg/kg':
                        conc_ppm = conc_val
                        conc_display = f"{conc} mg/kg ({conc_ppm:.0f} ppm)"
                    else:
                        conc_ppm = conc_val
                        conc_display = f"{conc} ppm"

                    limit_val = float(row['threshold_ppm']) if row['threshold_ppm'] else float('inf')
                    status = 'PASS ✓' if conc_ppm <= limit_val else 'FAIL ✗'
                except:
                    conc_display = f"{conc} {unit}"
                    status = 'N/A'

            data.append([
                row['part_number'],
                row['substance'],
                conc_display,
                limit,
                status
            ])

    # Create results table
    results_table = Table(data, colWidths=[1.2*inch, 1.8*inch, 1.8*inch, 1.2*inch, 1*inch])
    results_table.setStyle(TableStyle([
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a472a')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),

        # Data rows
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f0f0')]),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
    ]))
    elements.append(results_table)
    elements.append(Spacer(1, 0.3*inch))

    # Notes section
    notes_text = '''<b>Notes:</b><br/>
• ND = Not Detected (below detection limit of 2 ppm)<br/>
• All measurements performed using XRF screening and ICP-MS confirmation<br/>
• Testing conducted in accordance with RoHS Directive 2011/65/EU and amendment 2015/863<br/>
• This certificate covers components manufactured between 2024-01-01 and 2024-10-31<br/>
• Maximum allowable concentrations: Lead (1000 ppm), Mercury (1000 ppm), Cadmium (100 ppm), Hexavalent Chromium (1000 ppm)
'''
    elements.append(Paragraph(notes_text, styles['Normal']))
    elements.append(Spacer(1, 0.3*inch))

    # Declaration
    declaration = '''
<b>DECLARATION:</b><br/>
We hereby certify that the tested components listed above have been analyzed for RoHS compliance.
Components marked as "PASS" comply with the requirements of the RoHS Directive 2011/65/EU regarding
the restriction of hazardous substances in electrical and electronic equipment. Components marked
as "FAIL" exceed permissible limits and require remediation or exemption justification.
'''
    elements.append(Paragraph(declaration, styles['Normal']))
    elements.append(Spacer(1, 0.4*inch))

    # Signature section
    signature_data = [
        ['', ''],
        ['_' * 40, '_' * 40],
        ['Dr. Klaus Müller', 'Berlin, Germany'],
        ['Quality Assurance Manager', datetime.now().strftime('%B %d, %Y')],
        ['Zentech Components GmbH', '']
    ]
    sig_table = Table(signature_data, colWidths=[3*inch, 3*inch])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 2), (0, 3), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    elements.append(sig_table)

    # Build PDF
    pdf.build(elements)
    print(f'✓ PDF created successfully: {output_path}')
    print(f'  Certificate Number: ZTC-ROHS-2024-1108')
    print(f'  Total parts tested: {len(data) - 1}')

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(script_dir, 'cert_rohs.csv')
    output_path = os.path.join(script_dir, 'cert_rohs.pdf')

    if not os.path.exists(csv_path):
        print(f'Error: CSV file not found: {csv_path}')
        exit(1)

    create_rohs_certificate(csv_path, output_path)
