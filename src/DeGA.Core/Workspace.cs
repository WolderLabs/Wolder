namespace DeGA.Core
{
    public class Workspace
    {
        private readonly IWorkspaceFileSystem _fileSystem;
        private readonly LayerActionFactory _layerActionFactory;
        private readonly List<Layer> _layers = [];

        //public Workspace(string name)
        //{
        //    // TODO: Create new workspace service container
        //}

        public Workspace(IWorkspaceFileSystem fileSystem, LayerActionFactory layerActionFactory)
        {
            _fileSystem = fileSystem;
            _layerActionFactory = layerActionFactory;
        }

        internal IWorkspaceFileSystem FileSystem => _fileSystem;

        public Workspace AddLayer(Action<Layer> configureLayer)
        {
            var layer = new Layer(_layerActionFactory, _fileSystem);
            _layers.Add(layer);
            configureLayer(layer);

            return this;
        }

        public async Task BuildAsync()
        {
            _fileSystem.EnsureRootDirectory();
            foreach (var layer in _layers)
            {
                foreach (var action in layer.Actions)
                {
                    await action.InvokeAsync(layer);
                }
            }
        }
    }
}
