namespace DeGA.Core.Files;

public class PipelineRootPath
{
    private string? _path;

    public string Path => Path
                          ?? throw new InvalidOperationException(
                              "Root path must be set before it can be accessed.");

    public void SetRootPath(string path)
    {
        _path = path;
    }
}