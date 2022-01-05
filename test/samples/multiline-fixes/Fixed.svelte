<script>
    if (window.foo)
        {window.foo =
            window.bar
                .toLowerCase()
                .replace('something', 'else')
                .trim();}

    function noElseReturn() {
        if (window) {
            return 'foo';
        } 
            return 'bar';
        
    }

    function noLonelyIf() {
        if (window) {
            doX();
        } else if (!window) {
                doY();
            }
    }
</script>
