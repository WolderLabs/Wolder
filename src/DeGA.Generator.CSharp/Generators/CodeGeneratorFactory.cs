using DeGA.Generator.CSharp.Compilation;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Generator.CSharp.Generators;

public class CodeGeneratorFactory(IServiceProvider services)
{
    public CodeGenerator Create(DotNetProject project)
    {
        return ActivatorUtilities.CreateInstance<CodeGenerator>(services, project);
    }
}
