namespace DeGA.Core
{
    public class GeneratorWorkspace
    {
        private readonly IWorkspaceFileSystem _fileSystem;
        private readonly LayerActionFactory _layerActionFactory;

        //public Workspace(string name)
        //{
        //    // TODO: Create new workspace service container
        //}

        public GeneratorWorkspace(IWorkspaceFileSystem fileSystem, LayerActionFactory layerActionFactory)
        {
            _fileSystem = fileSystem;
            _layerActionFactory = layerActionFactory;
        }

        internal IWorkspaceFileSystem FileSystem => _fileSystem;

        public Generator<TScope> StartScope<TScope>(TScope scope) where TScope : IGeneratorScope
        {
            return new Generator<TScope>(scope);
        }

        public async Task BuildAsync()
        {
            _fileSystem.EnsureRootDirectory();
            //foreach (var layer in _layers)
            //{
            //    foreach (var action in layer.Actions)
            //    {
            //        await action.InvokeAsync(layer);
            //    }
            //}
        }
    }
}
