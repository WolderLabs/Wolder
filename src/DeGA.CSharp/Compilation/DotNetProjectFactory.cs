using Microsoft.Extensions.DependencyInjection;

namespace DeGA.CSharp.Compilation;

public class DotNetProjectFactory(IServiceProvider services)
{
    public DotNetProject Create(DotNetProjectReference reference)
    {
        var path = reference.ProjectFilePath;
        return ActivatorUtilities.CreateInstance<DotNetProject>(services, path);
    }
}
