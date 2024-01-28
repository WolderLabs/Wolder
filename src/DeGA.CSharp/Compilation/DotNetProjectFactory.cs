using Microsoft.Extensions.DependencyInjection;

namespace DeGA.CSharp.Compilation;

public class DotNetProjectFactory(IServiceProvider services)
{
    public DotNetProject Create(DotNetProjectReference reference)
    {
        var path = reference.RelativeFilePath;
        return ActivatorUtilities.CreateInstance<DotNetProject>(services, path);
    }
}
