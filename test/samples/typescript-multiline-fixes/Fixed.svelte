<script lang="ts">
    interface Foo {}

    if (window.foo)
        {window.foo =
            window.bar
                .toLowerCase()
                .replace('something' as string, 'else')
                .trim();}

    function noElseReturn(): string {
        if (window) {
            return 'foo';
        } 
            return 'bar' as string;
        
    }

    function noLonelyIf(): void {
        if (window) {
            doX();
        } else if (!window) {
                (doY as any)();
            }
    }
</script>
