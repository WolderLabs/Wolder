using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Generator.CSharp.Compilation;

public class DotNetProjectFactory(IServiceProvider services)
{
    public DotNetProject Create(string path)
    {
        return ActivatorUtilities.CreateInstance<DotNetProject>(services, path);
    }
}
