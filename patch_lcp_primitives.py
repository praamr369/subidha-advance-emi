import sys

def modify_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    target = """        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}"""
    
    replacement = """        {description ? (
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            {description.split('. ').map((sentence, idx, arr) => (
              <span key={idx}>
                {sentence}
                {idx < arr.length - 1 ? '. ' : ''}
              </span>
            ))}
          </div>
        ) : null}"""
    
    content = content.replace(target, replacement)
    
    with open(filepath, 'w') as f:
        f.write(content)

modify_file('frontend/src/components/ui/portal-primitives.tsx')
