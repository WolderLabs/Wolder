namespace DeGA.Core.Files;

public class PipelineRootPath
{
    private string? _path;

    public string Path => _path
        ?? throw new InvalidOperationException(
            "Root path must be set before it can be accessed.");

    public void SetRootPath(string path)
    {
        if (_path is not null)
        {
            throw new InvalidOperationException("Root path was already set.");
        }
        _path = path;
    }
}