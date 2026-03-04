import PyPDF2

path = r"c:\Users\admin\Documents\prompt.pdf"
reader = PyPDF2.PdfReader(path)
for i, page in enumerate(reader.pages):
    print(f"--- Page {i+1} ---")
    text = page.extract_text()
    if text:
        print(text)
    else:
        print("<no text extracted>")
